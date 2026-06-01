package com.calebhabesh.linewatch.status;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;

import com.calebhabesh.linewatch.station.TransitLineEntity;
import com.calebhabesh.linewatch.station.TransitLineRepository;
import org.junit.jupiter.api.Test;

class StatusControllerTest {

    @Test
    void statusLabelsSeededPayloadAsDemoData() {
        TransitLineRepository repository = mock(TransitLineRepository.class);
        when(repository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
                new TransitLineEntity("line-1", "1", "Yonge-University", "#f4c430", 1)
        ));
        StatusController controller = new StatusController(repository);

        StatusController.StatusResponse response = controller.getStatus();

        assertThat(response.generatedAt().live()).isFalse();
        assertThat(response.generatedAt().lastPoll()).isEqualTo("Seeded backend demo");
        assertThat(response.lines()).hasSize(1);
    }
}
